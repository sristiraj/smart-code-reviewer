import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { z } from 'zod';
import { RCConfig } from '../types/index.js';

const ExternalCheckerSchema = z.object({
  name: z.string(),
  command: z.string(),
});

const RCSchema = z
  .object({
    base_branch: z.string().optional(),
    enable: z.array(z.string()).optional(),
    disable: z.array(z.string()).optional(),
    external_checkers: z.array(ExternalCheckerSchema).optional(),
    jaccard_threshold: z.number().min(0).max(1).optional(),
    cosine_threshold: z.number().min(0).max(1).optional(),
  })
  .refine(
    (data) => !(data.enable !== undefined && data.disable !== undefined),
    {
      message:
        'RC file must not contain both "enable" and "disable" — specify one or the other, not both',
      path: ['enable', 'disable'],
    }
  );

const DEFAULT_CONFIG: RCConfig = {
  baseBranch: 'main',
  enable: undefined,
  disable: undefined,
  externalCheckers: [],
  jaccardThreshold: 0.8,
  cosineThreshold: 0.75,
};

export function parseRCFile(configPath: string): RCConfig {
  if (!fs.existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }

  let raw: unknown;
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    raw = yaml.load(content);
  } catch (err) {
    throw new Error(`Failed to parse RC file at ${configPath}: ${(err as Error).message}`);
  }

  if (raw === null || raw === undefined) {
    return { ...DEFAULT_CONFIG };
  }

  const result = RCSchema.safeParse(raw);
  if (!result.success) {
    const messages = result.error.issues.map((i) => i.message).join('; ');
    throw new Error(`Invalid RC config at ${configPath}: ${messages}`);
  }

  const data = result.data;
  return {
    baseBranch: data.base_branch ?? 'main',
    enable: data.enable,
    disable: data.disable,
    externalCheckers: data.external_checkers ?? [],
    jaccardThreshold: data.jaccard_threshold ?? 0.8,
    cosineThreshold: data.cosine_threshold ?? 0.75,
  };
}
