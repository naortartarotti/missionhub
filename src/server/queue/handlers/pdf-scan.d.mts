export declare const MAX_BYTES: number;
export declare const SCAN_BUDGET_MS: number;
export declare function decodeNames(text: string): string;
export declare function pdfHasActiveContent(bytes: Uint8Array, timeBudgetMs?: number): boolean;
export declare function evidenceVerdict(bytes: Uint8Array, mime: string, declaredSize: number, timeBudgetMs?: number): "clean" | "rejected";
