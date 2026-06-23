export type ScanMode = 'full' | 'diff';

export interface FindingReference {
  filePath: string;
  lineNumber: number;
}

export interface Finding {
  filePath: string;
  lineNumber: number;
  description: string;
  reference: FindingReference;
  detectedAt: string;
  algorithmName: string;
  algorithmMethodology: string;
}

export type CodebaseIndex = Map<string, string>;

export interface ExternalCheckerConfig {
  name: string;
  command: string;
}

export interface RCConfig {
  baseBranch: string;
  enable: string[] | undefined;
  disable: string[] | undefined;
  externalCheckers: ExternalCheckerConfig[];
  jaccardThreshold: number;
  cosineThreshold: number;
}

export interface Algorithm {
  name: string;
  methodology: string;
  run(targets: string[], index: CodebaseIndex, config: RCConfig): Promise<Finding[]>;
}

export interface ScanResult {
  findings: Finding[];
  scannedFiles: string[];
  mode: ScanMode;
  timestamp: string;
}
