/**
 * This script outputs dependencies with known security vulnerabilities that have a fix available,
 * grouped by severity.
 */

import child_process from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

interface AuditAdvisory {
  severity: string;
  title: string;
  url: string;
}

interface AuditVulnerability {
  fixAvailable: boolean | { isSemVerMajor: boolean; name: string; version: string };
  name: string;
  nodes: string[];
  severity: string;
  via: (AuditAdvisory | string)[];
}

interface AuditReport {
  vulnerabilities: Partial<Record<string, AuditVulnerability>>;
}

interface PackageLock {
  packages: Partial<Record<string, { version: string }>>;
}

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const packageLock = JSON.parse(
  (await fs.promises.readFile(path.join(__dirname, '..', 'package-lock.json'))).toString(),
) as PackageLock;

const auditReport = JSON.parse(
  child_process.spawnSync('npm', ['audit', '--json'], { windowsHide: true }).stdout.toString(),
) as AuditReport;

const severities = ['critical', 'high', 'moderate'];
const severitySymbols: Record<string, string> = {
  critical: '🔥',
  high: '🛑',
  moderate: '⚠️',
};
const result: Record<string, Record<string, string>> = Object.fromEntries(
  severities.map((s) => [s, {}]),
);

for (const vulnerability of Object.values(auditReport.vulnerabilities)) {
  if (!vulnerability) continue;

  const advisories = vulnerability.via
    .filter((v): v is AuditAdvisory => typeof v !== 'string')
    .filter((v) => severities.includes(v.severity));
  if (advisories.length === 0) continue;

  for (const nodePath of vulnerability.nodes) {
    const pkgEntry = packageLock.packages[nodePath];
    if (!pkgEntry) {
      continue;
    }

    const key = `${vulnerability.name}@${pkgEntry.version}`;

    if (vulnerability.fixAvailable === false) {
      const symbol = severitySymbols[vulnerability.severity] ?? '';
      process.stderr.write(`${key} ... ${vulnerability.severity} (no fix available) ${symbol}\n`);
      continue;
    }

    for (const advisory of advisories) {
      result[advisory.severity][key] = advisory.url;
      const symbol = severitySymbols[advisory.severity] ?? '';
      process.stderr.write(`${key} ... ${advisory.severity} ${symbol}\n`);
    }
  }
}

if (Object.values(result).some((deps) => Object.keys(deps).length > 0)) {
  process.stdout.write(`${JSON.stringify(result, undefined, 2)}\n`);
}
