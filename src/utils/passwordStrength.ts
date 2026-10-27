export type PasswordCriteria = {
  minLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
  hasSpecial: boolean;
};

export type PasswordStrength = {
  score: number; // 0-4
  label: "weak" | "good" | "strong";
  criteria: PasswordCriteria;
};

export function evaluatePasswordStrength(password: string): PasswordStrength {
  const criteria: PasswordCriteria = {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[^A-Za-z0-9]/.test(password),
  };

  let score = 0;
  if (criteria.minLength) score++;
  if (criteria.hasUppercase) score++;
  if (criteria.hasLowercase) score++;
  if (criteria.hasNumber) score++;
  if (criteria.hasSpecial) score++;

  if (score <= 2) {
    return { score, label: "weak", criteria };
  }
  if (score >= 4 && criteria.minLength && criteria.hasSpecial) {
    return { score, label: "strong", criteria };
  }
  if (score === 3) {
    return { score, label: "good", criteria };
  }
  return { score, label: "strong", criteria };
}

export function isPasswordStrongEnough(password: string): boolean {
  const strength = evaluatePasswordStrength(password);
  if (strength.label === "weak") return false;
  if (!strength.criteria.minLength) return false;
  const met = Object.values(strength.criteria).filter(Boolean).length;
  return met >= 3;
}
