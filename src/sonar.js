const scanner = require('sonarqube-scanner');
require('dotenv').config();

scanner(
  {
    serverUrl: process.env.SONAR_HOST_URL || 'http://localhost:9000',
    token: process.env.SONAR_TOKEN,
    options: {
      'sonar.projectKey': 'gonna-play-backend',
      'sonar.projectName': 'Gonna Play Backend',
      'sonar.projectVersion': '1.0.0',
      'sonar.sources': 'src',
      'sonar.tests': 'src/__tests__',
      'sonar.exclusions': 'node_modules/**,**/__tests__/**,**/dist/**,**/build/**',
      'sonar.typescript.lcov.reportPaths': 'coverage/lcov.info',
      'sonar.javascript.lcov.reportPaths': 'coverage/lcov.info',
      'sonar.sourceEncoding': 'UTF-8',
      'sonar.coverage.exclusions': '**/__tests__/**,**/node_modules/**,**/migrations/**',
    },
  },
  () => process.exit()
);
