import { describe, it, expect } from "vitest";
import {
  cleanSkillString,
  normalizeSingleSkill,
  normalizeSkills,
} from "@/services/ai/tools/skillNormalizer.js";

describe("Skill Normalization Tool", () => {
  it("cleans skill strings by trimming, lowercasing, and normalizing whitespace", () => {
    expect(cleanSkillString("  React.JS  ")).toBe("react.js");
    expect(cleanSkillString("TypeSCRIPT\t\tLang")).toBe("typescript lang");
    expect(cleanSkillString("")).toBe("");
  });

  it("normalizes explicit synonyms to their canonical names", () => {
    expect(normalizeSingleSkill("ReactJS")).toBe("react");
    expect(normalizeSingleSkill("react.js")).toBe("react");
    expect(normalizeSingleSkill("TS")).toBe("typescript");
    expect(normalizeSingleSkill("JS")).toBe("javascript");
    expect(normalizeSingleSkill("Node.JS")).toBe("nodejs");
    expect(normalizeSingleSkill("expressjs")).toBe("express");
    expect(normalizeSingleSkill("postgres")).toBe("postgresql");
    expect(normalizeSingleSkill("k8s")).toBe("kubernetes");
    expect(normalizeSingleSkill("docker")).toBe("docker");
    expect(normalizeSingleSkill("amazon web services")).toBe("aws");
    expect(normalizeSingleSkill("tailwind")).toBe("tailwind css");
  });

  it("preserves unknown skills in clean normalized format", () => {
    expect(normalizeSingleSkill("UnusualProprietaryTool")).toBe("unusualproprietarytool");
    expect(normalizeSingleSkill("Some Custom Lib")).toBe("some custom lib");
  });

  it("deduplicates skills and maintains correct counts", () => {
    const rawSkills = ["React", "react.js", "ReactJS", "TypeScript", "ts", "Node.js", "nodejs", "CustomSkill"];
    const result = normalizeSkills(rawSkills);

    expect(result.originalCount).toBe(8);
    expect(result.normalizedCount).toBe(4);
    expect(result.normalizedSkills).toEqual(["react", "typescript", "nodejs", "customskill"]);
  });

  it("handles empty arrays or invalid inputs gracefully", () => {
    const resultEmpty = normalizeSkills([]);
    expect(resultEmpty.normalizedSkills).toEqual([]);
    expect(resultEmpty.originalCount).toBe(0);
    expect(resultEmpty.normalizedCount).toBe(0);

    const resultNull = normalizeSkills(null as any);
    expect(resultNull.normalizedSkills).toEqual([]);
  });
});
