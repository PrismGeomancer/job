// Example cards for the empty Coins page. Each has no stamp, no card number and no link,
// and disappears as soon as a real coin launches. Theme: heists, getaways and side jobs.
import { copy } from "../copy.js";
import { timeCard } from "./card.js";

const EXAMPLES = [
  { name: "Heist Crew", ticker: "HEIST", job: "payroll", amount: "4.20 SOL" },
  { name: "Wanted Level", ticker: "WANTED", job: "cleaner", amount: "5.00M WANTED" },
  { name: "Getaway Driver", ticker: "GETAWAY", job: "builder", amount: "1.88 SOL" },
  { name: "Side Hustle", ticker: "HUSTLE", job: "payroll", amount: "0.96 SOL" },
  { name: "Safehouse", ticker: "SAFE", job: "builder", amount: "2.31 SOL" },
];

export function exampleCards() {
  return EXAMPLES.map((e) =>
    timeCard({ name: e.name, ticker: e.ticker, job: e.job, image: null }, { label: copy.jobs[e.job].counter, text: e.amount },
      { stamp: false }));
}
