export default {
  entry: {
    index: './src/index.ts',
    engine: './src/engine.ts',
    options: './src/options.ts',
    rule: './src/rule.ts',
    text: './src/text.ts',
    time: './src/time.ts',
  },
  clean: true,
  dts: true,
  format: 'esm',
  outDir: 'dist',
  sourcemap: true,
};
