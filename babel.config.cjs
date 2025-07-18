module.exports = {
  presets: [
    [
      '@babel/preset-env',
      {
        targets: {
          node: '18.0.0', // Explicit Node.js version instead of 'current'
        },
        modules: false, // Let bundlers handle module transformation
        useBuiltIns: 'usage',
        corejs: 3,
        shippedProposals: true,
        bugfixes: true,
      },
    ],
  ],
  plugins: [
    '@babel/plugin-transform-optional-chaining',
    '@babel/plugin-transform-nullish-coalescing-operator',
  ],
  env: {
    test: {
      presets: [
        [
          '@babel/preset-env',
          {
            targets: {
              node: 'current',
            },
            modules: 'auto', // Allow CommonJS for Jest
          },
        ],
      ],
    },
  },
};
