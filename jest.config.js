module.exports = {
  projects: [
    {
      displayName: 'backend',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/backend/tests/**/*.test.js']
    },
    {
      displayName: 'frontend',
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/frontend/tests/**/*.test.{js,jsx}'],
      setupFilesAfterEnv: ['<rootDir>/frontend/tests/setup.js'],
      transform: {
        '^.+\\.jsx?$': 'babel-jest'
      },
      moduleNameMapper: {
        '\\.(css|less|scss)$': 'identity-obj-proxy'
      }
    }
  ]
};
