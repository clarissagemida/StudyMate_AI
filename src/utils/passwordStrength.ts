export type PasswordCriteria = {
  minLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
  hasSpecial: boolean;
};

export type PasswordStrength = {
  score: number; // 0-5 checks passed
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

  const characterTypeCount = [
    criteria.hasUppercase,
    criteria.hasLowercase,
    criteria.hasNumber,
    criteria.hasSpecial,
  ].filter(Boolean).length;

  // The indicator should move through all three states as the teacher types:
  // a few characters are weak, a longer draft is good, and the accepted
  // minimum (8+ characters plus three character types) is strong.
  if (password.length < 4) {
    return { score, label: "weak", criteria };
  }
  if (criteria.minLength && characterTypeCount >= 3) {
    return { score, label: "strong", criteria };
  }
  return { score, label: "good", criteria };
}

export function isPasswordStrongEnough(password: string): boolean {
  const strength = evaluatePasswordStrength(password);
  const characterTypes = [
    strength.criteria.hasUppercase,
    strength.criteria.hasLowercase,
    strength.criteria.hasNumber,
    strength.criteria.hasSpecial,
  ].filter(Boolean).length;
  return strength.criteria.minLength && characterTypes >= 3;
}
