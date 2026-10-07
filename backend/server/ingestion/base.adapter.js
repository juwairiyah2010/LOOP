import crypto from "crypto";

export class BaseSourceAdapter {
  constructor(name = "base_adapter") {
    this.name = name;
  }

  async fetch() {
    throw new Error(`fetch() method must be implemented by adapter '${this.name}'`);
  }

  computeHash(title, organization, description = "", deadline = "", applyUrl = "") {
    const raw = `${(title || "").toLowerCase().trim()}_${(organization || "").toLowerCase().trim()}_${(description || "").substring(0, 100)}_${deadline}_${applyUrl}`;
    return crypto.createHash("sha256").update(raw).digest("hex");
  }

  normalize(_rawItem) {
    throw new Error(`normalize() method must be implemented by adapter '${this.name}'`);
  }

  validate(opp) {
    const errors = [];
    if (!opp || typeof opp !== "object") {
      return { isValid: false, errors: ["Invalid opportunity object"] };
    }
    if (!opp.title || typeof opp.title !== "string" || !opp.title.trim()) {
      errors.push("Missing or invalid title");
    }
    if (!opp.organization || typeof opp.organization !== "string" || !opp.organization.trim()) {
      errors.push("Missing or invalid organization");
    }
    if (!opp.category || typeof opp.category !== "string") {
      errors.push("Missing or invalid category");
    }
    if (opp.deadline) {
      const parsed = new Date(opp.deadline);
      if (isNaN(parsed.getTime())) {
        errors.push("Invalid deadline date format");
      }
    }
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}
