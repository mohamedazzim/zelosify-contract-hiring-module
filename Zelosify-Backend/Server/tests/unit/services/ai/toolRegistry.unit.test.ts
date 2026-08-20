import { describe, it, expect, vi } from "vitest";
import { ToolRegistry } from "@/services/ai/tools/toolRegistry.js";
import * as docParser from "@/services/ai/tools/documentParser.js";

describe("Tool Registry", () => {
  it("initializes and exposes all 4 core Phase 4B tool definitions", () => {
    const registry = new ToolRegistry();
    const definitions = registry.getToolDefinitions();

    expect(definitions.length).toBe(4);
    const names = definitions.map((d) => d.name);
    expect(names).toContain("parse_resume_document");
    expect(names).toContain("extract_candidate_features");
    expect(names).toContain("normalize_skills");
    expect(names).toContain("calculate_deterministic_score");
  });

  it("rejects unknown tool names with a structured error", async () => {
    const registry = new ToolRegistry();
    const result = await registry.execute("non_existent_tool", { foo: "bar" });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown tool: "non_existent_tool"');
  });

  it("rejects invalid input arguments with schema validation errors", async () => {
    const registry = new ToolRegistry();

    // calculate_deterministic_score requires candidateExp, minExp, candidateSkills, etc.
    const invalidArgs = {
      candidateExp: -5, // Invalid negative
      minExp: 3,
      // Missing candidateSkills, requiredSkills, candidateLocation
    };

    const result = await registry.execute("calculate_deterministic_score", invalidArgs);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid arguments for tool");
  });

  it("successfully executes calculate_deterministic_score and validates output", async () => {
    const registry = new ToolRegistry();

    const validArgs = {
      candidateExp: 5,
      minExp: 3,
      maxExp: 6,
      candidateSkills: ["React", "TypeScript"],
      requiredSkills: ["react", "typescript"],
      candidateLocation: "Remote",
      openingLocation: "Remote",
    };

    const result = await registry.execute("calculate_deterministic_score", validArgs);

    expect(result.success).toBe(true);
    expect(result.data.finalScore).toBe(1.0);
    expect(result.data.thresholdCategory).toBe("RECOMMENDED");
  });

  it("handles runtime tool execution exceptions cleanly without crashing", async () => {
    const registry = new ToolRegistry();

    vi.spyOn(docParser, "parseResumeDocument").mockRejectedValue(
      new Error("S3 connection refused")
    );

    const result = await registry.execute("parse_resume_document", {
      s3Key: "some/key.pdf",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("S3 connection refused");
  });
});
