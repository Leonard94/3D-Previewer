declare module 'gltf-validator' {
  export interface ValidatorMessage {
    code: string;
    message: string;
    /** 0 — ошибка, 1 — предупреждение, 2 — инфо, 3 — подсказка. */
    severity: 0 | 1 | 2 | 3;
    pointer?: string;
    offset?: number;
  }

  export interface ValidatorReport {
    issues: {
      numErrors: number;
      numWarnings: number;
      numInfos: number;
      numHints: number;
      messages: ValidatorMessage[];
      truncated: boolean;
    };
  }

  export interface ValidationOptions {
    uri?: string;
    format?: 'glb' | 'gltf';
    externalResourceFunction?: (uri: string) => Promise<Uint8Array>;
    writeTimestamp?: boolean;
    maxIssues?: number;
    ignoredIssues?: string[];
    onlyIssues?: string[];
    severityOverrides?: Record<string, number>;
  }

  export function validateBytes(data: Uint8Array, options?: ValidationOptions): Promise<ValidatorReport>;
  export function version(): string;
}
