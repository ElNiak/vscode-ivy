/**
 * Compare two semver strings. Returns true if `installed` is strictly
 * older than `target`.
 */
export function isOlderVersion(installed: string, target: string): boolean {
    const parse = (v: string): [number, number, number] => {
        const parts = v.split(".").map(Number);
        return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
    };
    const [a, b, c] = parse(installed);
    const [x, y, z] = parse(target);
    return a < x || (a === x && (b < y || (b === y && c < z)));
}
