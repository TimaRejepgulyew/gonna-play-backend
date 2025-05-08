import { addAliases } from 'module-alias';
import path from 'path';

// Add path aliases for production build
addAliases({
  '@': path.join(__dirname),
});

// Export for potential usage in other files
export default { addAliases }; 