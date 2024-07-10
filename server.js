import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import pg from "pg";
import { body, validationResult } from "express-validator";

const app = express();

// Middleware to handle CORS
app.use((req, res, next) => {
  const allowedOrigins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://apartment-affordability-checker.vercel.app",
    "https://apartment-affordability-checker-pascal-georges-projects.vercel.app",
    "https://apartment-cost-analyzer-backend.vercel.app",
  ];
  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS, PUT, PATCH, DELETE"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-Requested-With, content-type, Authorization"
  );
  res.setHeader("Access-Control-Allow-Credentials", true);

  if (req.method === "OPTIONS") {
    return res.sendStatus(204); // No Content
  }
  next();
});

app.use(
  cors({
    origin: (origin, callback) => {
      if (allowedOrigins.includes(origin) || !origin) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

// Middleware to parse JSON bodies
app.use(express.json());

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
});

pool.connect((err, _client, release) => {
  if (err) {
    return console.error("Error acquiring client", err.stack);
  }
  console.log("Connected to database");
  release(); // Ensure the connection is released back to the pool
});

function isNumeric(value) {
  return !isNaN(parseFloat(value)) && isFinite(value);
}

const fieldLabels = {
  movingAndSetupCost: "Moving & Setup Costs",
  monthlyLivingCost: "Monthly Living Costs",
  rent: "Monthly Rent",
  securityDeposit: "Security Deposit",
  totalMonthlyIncome: "Total Monthly Income",
  totalSavings: "Total Savings",
  monthsToEvaluate: "Months to Evaluate",
};

// POST endpoint to handle validation
app.post("/validate", (req, res) => {
  const {
    movingAndSetupCost,
    monthlyLivingCost,
    rent,
    securityDeposit,
    totalMonthlyIncome,
    totalSavings,
    monthsToEvaluate,
  } = req.body;

  // Validate costs
  if (!movingAndSetupCost || movingAndSetupCost < 0) {
    return res
      .status(400)
      .json({ error: "Invalid moving and setup costs provided." });
  }
  if (!monthlyLivingCost || monthlyLivingCost < 0) {
    return res
      .status(400)
      .json({ error: "Invalid monthly living costs provided." });
  }
  if (!rent || rent <= 0) {
    return res.status(400).json({ error: "Invalid rent provided." });
  }
  if (!monthsToEvaluate || monthsToEvaluate < 1 || monthsToEvaluate > 60) {
    return res
      .status(400)
      .json({ error: "Months To Evaluate must be between 1 and 60." });
  }
  if (!securityDeposit || securityDeposit < 0) {
    return res
      .status(400)
      .json({ error: "Invalid security deposit provided." });
  }
  if (!totalMonthlyIncome || totalMonthlyIncome <= 0) {
    return res
      .status(400)
      .json({ error: "Invalid total monthly income provided." });
  }
  if (!totalSavings || totalSavings < 0) {
    return res.status(400).json({ error: "Invalid total savings provided." });
  }

  const parameters = {
    movingAndSetupCost,
    monthlyLivingCost,
    rent,
    securityDeposit,
    totalMonthlyIncome,
    totalSavings,
    monthsToEvaluate,
  };

  // Check each parameter for numeric validity
  for (let [key, value] of Object.entries(parameters)) {
    if (!isNumeric(value)) {
      const label = fieldLabels[key] || key; // Use the label from fieldLabels, default to key if no label is found
      return res
        .status(400)
        .json({ error: `${label} must be a valid number.` });
    }
  }

  // Convert values to numbers and proceed with processing
  const numMovingAndSetupCost = parseFloat(movingAndSetupCost);
  const numMonthlyLivingCost = parseFloat(monthlyLivingCost);
  const numRent = parseFloat(rent);
  const numSecurityDeposit = parseFloat(securityDeposit);
  const numTotalMonthlyIncome = parseFloat(totalMonthlyIncome);
  const numTotalSavings = parseFloat(totalSavings);
  const numMonthsToEvaluate = parseInt(monthsToEvaluate, 10);

  try {
    // Perform calculations
    const initialCosts = numMovingAndSetupCost + numSecurityDeposit;
    const totalMonthlyCost = numMonthlyLivingCost + numRent;
    const totalCostOverTime =
      initialCosts + totalMonthlyCost * numMonthsToEvaluate;
    const totalFundsAvailable =
      numTotalSavings + numTotalMonthlyIncome * numMonthsToEvaluate;
    const canAfford = totalFundsAvailable >= totalCostOverTime;
    const additionalMonthlyIncomeNeeded = canAfford
      ? 0
      : (
          (totalCostOverTime - numTotalSavings) / numMonthsToEvaluate -
          numTotalMonthlyIncome
        ).toFixed(2);

    // Prepare the response
    const response = {
      initialCosts,
      totalMonthlyCost,
      totalCostOverTime,
      affordabilityDuration: Math.floor(totalFundsAvailable / totalMonthlyCost),
      canAfford,
      additionalMonthlyIncomeNeeded,
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("Error processing validation:", error);
    res.status(500).json({ error: "Error processing your request." });
  }
});

app.post(
  "/feedback",
  // Validation and sanitization middleware
  body("feedback").trim().escape(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { feedback } = req.body;
    console.log("Received feedback:", feedback); // Log received feedback

    try {
      const result = await pool.query(
        "INSERT INTO feedback (content) VALUES ($1) RETURNING *",
        [feedback]
      );
      console.log("Feedback saved successfully:", result.rows[0]); // Log successful save
      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error("Error saving feedback:", error); // Detailed error logging
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Define the port and start the server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
