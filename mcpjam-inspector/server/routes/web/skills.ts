import { Hono } from "hono";
import { assertBearerToken } from "./errors.js";
import { webError, ErrorCode } from "./errors.js";

const skills = new Hono();

/**
 * Hosted-mode skills API. Uses Bearer auth (Convex JWT).
 * Skills are filesystem-based in local mode; in hosted mode we return empty
 * list and reject mutating operations so the UI does not 401.
 */

skills.post("/list", async (c) => {
  assertBearerToken(c);
  return c.json({ skills: [] });
});

skills.post("/get", async (c) => {
  assertBearerToken(c);
  return webError(c, 404, ErrorCode.NOT_FOUND, "Skill not found");
});

skills.post("/upload", async (c) => {
  assertBearerToken(c);
  return webError(
    c,
    410,
    ErrorCode.FEATURE_NOT_SUPPORTED,
    "Skill upload is not supported in hosted mode",
  );
});

skills.post("/upload-folder", async (c) => {
  assertBearerToken(c);
  return webError(
    c,
    410,
    ErrorCode.FEATURE_NOT_SUPPORTED,
    "Skill upload is not supported in hosted mode",
  );
});

skills.post("/delete", async (c) => {
  assertBearerToken(c);
  return webError(
    c,
    410,
    ErrorCode.FEATURE_NOT_SUPPORTED,
    "Skill delete is not supported in hosted mode",
  );
});

skills.post("/files", async (c) => {
  assertBearerToken(c);
  return webError(c, 404, ErrorCode.NOT_FOUND, "Skill not found");
});

skills.post("/read-file", async (c) => {
  assertBearerToken(c);
  return webError(c, 404, ErrorCode.NOT_FOUND, "Skill file not found");
});

export default skills;
