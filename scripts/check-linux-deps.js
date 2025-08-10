// Linux system dependency checker for Debian/Ubuntu/Kali-based systems.
// Prints a friendly, colorized warning if required packages are missing.
// Never fails the build; only warns.

import { execSync } from 'node:child_process';

const COLORS = {
	reset: '\x1b[0m',
	bold: '\x1b[1m',
	yellow: '\x1b[33m',
	red: '\x1b[31m',
	cyan: '\x1b[36m'
};

function isLinux() {
	return process.platform === 'linux';
}

function hasCommand(cmd) {
	try {
		execSync(`command -v ${cmd}`, { stdio: 'ignore' });
		return true;
	} catch (_) {
		return false;
	}
}

function isInstalledDpkg(pkgName) {
	try {
		// Use plain string concatenation so ${Status} is passed literally to dpkg-query (avoid JS template interpolation)
		const cmd = "dpkg-query -W -f='${Status}' " + pkgName + " 2>/dev/null || true";
		const out = execSync(cmd, { encoding: 'utf8' });
		return out.includes('install ok installed');
	} catch (_) {
		return false;
	}
}

function main() {
	if (!isLinux()) {
		return;
	}

	// Only check on APT-based systems
	if (!hasCommand('dpkg-query')) {
		return;
	}

	// Required packages (Debian/Ubuntu/Kali-based)
	// Note: libwebkit2gtk-4.1-dev is preferred; accept 4.0-dev as present for detection.
	const required = [
		{ name: 'pkg-config', alts: [] },
		{ name: 'libgtk-3-dev', alts: [] },
		{ name: 'libwebkit2gtk-4.1-dev', alts: ['libwebkit2gtk-4.0-dev'] },
		{ name: 'libayatana-appindicator3-dev', alts: [] },
		{ name: 'librsvg2-dev', alts: [] },
		{ name: 'libglib2.0-dev', alts: [] }
	];

	const missing = [];
	for (const spec of required) {
		const candidates = [spec.name, ...spec.alts];
		const present = candidates.some((pkg) => isInstalledDpkg(pkg));
		if (!present) {
			missing.push(spec.name);
		}
	}

	if (missing.length > 0) {
		const header = `${COLORS.bold}${COLORS.yellow}Linux system dependencies missing (APT-based)${COLORS.reset}`;
		const note = `${COLORS.cyan}These are system-level packages and cannot be installed via npm or cargo.${COLORS.reset}`;
		const list = missing.map((m) => `  - ${m}`).join('\n');
		const installCmd = 'sudo apt install pkg-config libgtk-3-dev libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev libglib2.0-dev';
		const cmdLine = `${COLORS.bold}${installCmd}${COLORS.reset}`;

		// Do not exit non-zero; only warn
		console.warn(`\n${header}\n\nMissing packages:\n${list}\n\nInstall with:\n${cmdLine}\n\n${note}\n`);
	}
}

try {
	main();
} catch (err) {
	// Never block the build; emit a short notice and continue
	console.warn(`${COLORS.yellow}Linux dependency check skipped due to an internal error:${COLORS.reset} ${String((err && err.message) || err)}`);
}


