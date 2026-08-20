import { describe, it, expect } from "vitest";
import {
  extractEducation,
  extractExperienceYears,
  extractKeywords,
  extractLocation,
  extractResumeFeatures,
  extractSkills,
} from "@/services/ai/tools/featureExtractor.js";

describe("Feature Extraction Tool", () => {
  const sampleResume = `
    Senior Frontend Engineer
    Location: San Francisco, CA
    
    Professional Summary:
    Fullstack developer with 6+ years of experience building scalable web applications.
    Education: B.S. in Computer Science from State University (2018).
    
    Technical Skills:
    React, TypeScript, Next.js, Node.js, PostgreSQL, Docker, Tailwind CSS, Redux, Vitest.
    
    Experience:
    Senior Software Engineer at TechCorp (2021 - Present)
    - Architected microservices with Node.js and AWS.
    Software Engineer at StartupXYZ (2018 - 2021)
    - Built responsive web interfaces with React and TypeScript.
  `;

  it("extracts explicit experience years accurately", () => {
    expect(extractExperienceYears("7 years of experience in backend development")).toBe(7);
    expect(extractExperienceYears("Over 10 yrs exp with cloud systems")).toBe(10);
    expect(extractExperienceYears(sampleResume)).toBe(6);
  });

  it("extracts experience from date ranges when explicit text is absent", () => {
    const dateRangeResume = "Software Engineer at Acme (2018 - 2022)\nFrontend Dev (2022 - 2024)";
    expect(extractExperienceYears(dateRangeResume)).toBe(6);
  });

  it("extracts normalized technical skills from text", () => {
    const skills = extractSkills(sampleResume);
    expect(skills).toContain("react");
    expect(skills).toContain("typescript");
    expect(skills).toContain("nextjs");
    expect(skills).toContain("nodejs");
    expect(skills).toContain("postgresql");
    expect(skills).toContain("docker");
    expect(skills).toContain("redux");
  });

  it("extracts candidate location accurately", () => {
    expect(extractLocation(sampleResume)).toBe("San Francisco, CA");
    expect(extractLocation("Based in: Austin, TX\nSoftware Engineer")).toBe("Austin, TX");
    expect(extractLocation("Remote developer working internationally")).toBe("Remote");
    expect(extractLocation("Just some plain text without city")).toBe("Unknown");
  });

  it("extracts education credentials and degrees", () => {
    const education = extractEducation(sampleResume);
    expect(education.some((e) => e.includes("B.S."))).toBe(true);

    const masterResume = "Holds a Master of Science in Data Engineering and Ph.D. in AI.";
    const gradEdu = extractEducation(masterResume);
    expect(gradEdu.some((e) => e.toLowerCase().includes("master"))).toBe(true);
    expect(gradEdu.some((e) => e.includes("Ph.D."))).toBe(true);
  });

  it("extracts keywords and domain terms", () => {
    const skills = ["react", "typescript"];
    const keywords = extractKeywords(sampleResume, skills);
    expect(keywords).toContain("frontend");
    expect(keywords).toContain("react");
    expect(keywords).toContain("typescript");
    expect(keywords).toContain("microservices");
  });

  it("produces complete ExtractedFeatures object with conservative defaults for empty text", () => {
    const emptyResult = extractResumeFeatures("");
    expect(emptyResult.experienceYears).toBe(0);
    expect(emptyResult.skills).toEqual([]);
    expect(emptyResult.location).toBe("Unknown");
    expect(emptyResult.education).toEqual([]);
    expect(emptyResult.keywords).toEqual([]);

    const fullResult = extractResumeFeatures(sampleResume);
    expect(fullResult.experienceYears).toBe(6);
    expect(fullResult.skills.length).toBeGreaterThan(3);
    expect(fullResult.location).toBe("San Francisco, CA");
  });
});
