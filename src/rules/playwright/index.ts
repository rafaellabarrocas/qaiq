import type { RulePack } from "../../core/types.js";
import { waitRules } from "./wait.js";
import { locatorRules } from "./locator.js";
import { ciRules } from "./ci.js";
import { isolationRules } from "./isolation.js";
import { assertionRules } from "./assertion.js";

export const playwrightPack: RulePack = {
  name: "playwright", framework: "playwright",
  rules: [...waitRules, ...locatorRules, ...ciRules, ...isolationRules, ...assertionRules],
};
