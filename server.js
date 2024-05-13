import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import pg from "pg";
import { body, validationResult } from "express-validator";

const app = express();

// Middleware to parse JSON bodies
app.use(express.json());

// Configure CORS
app.use(
  cors({
    origin: "http://localhost:3000", // Allow only this origin to access
  })
);

const { Pool } = pg;
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

function isNumeric(value) {
  return !isNaN(parseFloat(value)) && isFinite(value);
}

const fieldLabels = {
  movingCost: "Moving Cost",
  rent: "Monthly Rent",
  utilities: "Utilities",
  immediateCost: "Immediate Cost",
  securityDeposit: "Security Deposit",
  netIncome: "Net Income",
  savings: "Total Savings",
  monthsToEvaluate: "Months to Evaluate",
  associatedCost: "Associated Cost",
  otherExpenses: "Other Expenses",
  // savingsGoal: "Monthly Savings/Investment",
};

// POST endpoint to handle validation
app.post("/validate", (req, res) => {
  const {
    movingCost,
    immediateCost,
    rent,
    securityDeposit,
    utilities,
    associatedCost,
    netIncome,
    savings,
    monthsToEvaluate,
    otherExpenses,
    // savingsGoal,
  } = req.body;

  // Validate costs
  if (!movingCost || movingCost < 0) {
    return res.status(400).json({ error: "Invalid moving cost provided." });
  }
  if (!rent || rent <= 0) {
    return res.status(400).json({ error: "Invalid rent provided." });
  }
  if (!utilities || utilities <= 0) {
    return res.status(400).json({ error: "Invalid utilities cost provided." });
  }
  if (!immediateCost || immediateCost < 0) {
    return res.status(400).json({ error: "Invalid immediate cost provided." });
  }
  if (!monthsToEvaluate || monthsToEvaluate < 1 || monthsToEvaluate > 60) {
    return res
      .status(400)
      .json({ error: "Months To Evaluate must be between 1 and 12." });
  }
  if (!securityDeposit || securityDeposit < 0) {
    return res
      .status(400)
      .json({ error: "Invalid security deposit provided." });
  }

  if (!associatedCost || associatedCost < 0) {
    return res.status(400).json({ error: "Invalid associated cost provided." });
  }

  if (!netIncome || netIncome <= 0) {
    return res.status(400).json({ error: "Invalid net income provided." });
  }

  if (!savings || savings < 0) {
    return res.status(400).json({ error: "Invalid savings amount provided." });
  }

  if (!otherExpenses || otherExpenses <= 0) {
    return res
      .status(400)
      .json({ error: "Invalid other expenses amount provided." });
  }

  // if (!savingsGoal || savingsGoal < 0) {
  //   return res.status(400).json({ error: "Invalid savings goal provided." });
  // }

  const parameters = {
    movingCost,
    immediateCost,
    rent,
    securityDeposit,
    utilities,
    associatedCost,
    netIncome,
    savings,
    monthsToEvaluate,
    otherExpenses,
    // savingsGoal,
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
  const numMovingCost = parseFloat(movingCost);
  const numRent = parseFloat(rent);
  const numUtilities = parseFloat(utilities);
  const numImmediateCost = parseFloat(immediateCost);
  const numSecurityDeposit = parseFloat(securityDeposit);
  const numNetIncome = parseFloat(netIncome);
  const numSavings = parseFloat(savings);
  const numMonthsToEvaluate = parseInt(monthsToEvaluate, 10);
  const numAssociatedCost = parseInt(associatedCost);
  const numOtherExpenses = parseInt(otherExpenses);
  // const numSavingsGoal = parseInt(savingsGoal);

  try {
    // Perform calculations
    const initialCosts =
      numMovingCost + numImmediateCost + numSecurityDeposit + numAssociatedCost;
    const totalMonthlyCost = numRent + numUtilities + numOtherExpenses;
    const totalCostOverTime =
      initialCosts + totalMonthlyCost * numMonthsToEvaluate;
    const affordabilityDuration = Math.floor(
      (numSavings + numNetIncome * numMonthsToEvaluate) / totalMonthlyCost
    );
    const canAfford = affordabilityDuration >= numMonthsToEvaluate;
    const additionalMonthlyIncomeNeeded = canAfford
      ? 0
      : (
          totalMonthlyCost -
          (numNetIncome + numSavings / numMonthsToEvaluate)
        ).toFixed(2);

    // Prepare the response
    const response = {
      initialCosts,
      totalMonthlyCost,
      totalCostOverTime,
      affordabilityDuration,
      canAfford: affordabilityDuration >= monthsToEvaluate,
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
