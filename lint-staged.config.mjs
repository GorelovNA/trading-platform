export default {
  '*.{ts,js,mjs,cjs,html}': ['prettier --write', 'eslint --fix --max-warnings=0'],
  '*.{json,jsonc,css,scss,md,yml,yaml}': ['prettier --write'],
};
