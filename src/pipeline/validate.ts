import { SoustackRecipe, ValidationResult } from "./types";

export interface Validator {
  validate(recipe: SoustackRecipe): ValidationResult;
}

const stubValidator: Validator = {
  validate: () => ({
    ok: true,
    errors: [],
    // TODO: wire up real validation rules from soustack-core once available.
  }),
};

type CoreValidationModule = {
  validator?: Validator;
  validateRecipe?: (recipe: SoustackRecipe) => ValidationResult;
};

let activeValidator: Validator = stubValidator;

const coreValidatorPromise = import("soustack-core")
  .then((module) => {
    const core = module as CoreValidationModule;
    if (core.validator) {
      return core.validator;
    }
    if (core.validateRecipe) {
      return {
        validate: core.validateRecipe,
      };
    }
    return null;
  })
  .catch(() => null);

void coreValidatorPromise.then((validator) => {
  if (validator) {
    activeValidator = validator;
  }
});

export function validate(recipe: SoustackRecipe): ValidationResult {
  return activeValidator.validate(recipe);
}
