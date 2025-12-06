
export class IntegrityError extends Error {
    issues: string[];

    constructor(issues: string[]) {
        super(`Integridad comprometida: ${issues.length} problemas detectados.`);
        this.name = 'IntegrityError';
        this.issues = issues;
    }
}
