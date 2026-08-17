import Ajv from "ajv";
import { readFile } from "node:fs/promises";

const SCHEMA_FILES = Object.freeze({
  config: "../schemas/video-config.schema.json",
  episode: "../schemas/episode-spec.schema.json",
  runLock: "../schemas/run-lock.schema.json",
});

const validators = new Map();

async function loadValidator(name) {
  if (validators.has(name)) return validators.get(name);
  const relative = SCHEMA_FILES[name];
  if (!relative) throw new TypeError(`Unknown schema: ${name}`);
  const schema = JSON.parse(
    await readFile(new URL(relative, import.meta.url), "utf8"),
  );
  const ajv = new Ajv({
    allErrors: true,
    strict: false,
    useDefaults: true,
  });
  const validator = ajv.compile(schema);
  validators.set(name, validator);
  return validator;
}

export async function validateSchema(name, value) {
  const validator = await loadValidator(name);
  const valid = validator(value);
  return {
    valid: Boolean(valid),
    errors: valid
      ? []
      : validator.errors.map((error) => ({
          path: error.instancePath || "/",
          keyword: error.keyword,
          message: error.message,
          params: error.params,
        })),
  };
}

export async function assertSchema(name, value) {
  const result = await validateSchema(name, value);
  if (!result.valid) {
    const details = result.errors
      .map((error) => `${error.path} ${error.message}`)
      .join("; ");
    const failure = new TypeError(`${name} schema validation failed: ${details}`);
    failure.code = "SCHEMA_VALIDATION_FAILED";
    failure.errors = result.errors;
    throw failure;
  }
  return value;
}

export function validateInlineSchema(schema, value) {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validator = ajv.compile(schema);
  const valid = validator(value);
  return {
    valid: Boolean(valid),
    errors: valid
      ? []
      : validator.errors.map((error) => ({
          path: error.instancePath || "/",
          keyword: error.keyword,
          message: error.message,
        })),
  };
}
