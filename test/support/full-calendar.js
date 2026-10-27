// Node >=22.15 test-only hook for the package's optional full calendar build.
import { registerHooks } from 'node:module';
registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(specifier === 'temporal-polyfill' ? 'temporal-polyfill/full' : specifier, context);
  },
});
