/** Split a content line without treating delimiters inside quoted parameters as syntax. */
export function parseContentLine(line: string): { name: string; parameters: Map<string, string>; value: string } {
  let quoted = false;
  let start = 0;
  const parts: string[] = [];
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === '"') quoted = !quoted;
    if (quoted) continue;
    if (char === ';') {
      parts.push(line.slice(start, index));
      start = index + 1;
    } else if (char === ':') {
      parts.push(line.slice(start, index));
      const name = parts.shift()!.toUpperCase();
      const parameters = new Map<string, string>();
      for (const part of parts) {
        const separator = part.indexOf('=');
        if (separator < 1) throw new Error(`Invalid property parameter: ${part}`);
        const key = part.slice(0, separator).toUpperCase();
        let value = part.slice(separator + 1);
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        parameters.set(key, value);
      }
      return { name, parameters, value: line.slice(index + 1) };
    }
  }
  throw new Error(`Invalid content line: ${line}`);
}
