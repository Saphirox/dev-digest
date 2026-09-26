/** Smart Diff — reviewer-ordered diff, deterministic classification + summary
 *  (no model call). */
export { buildSmartDiff, type SmartDiffInputFile } from './build.js';
export { classifyFile } from './classify.js';
export { ROLE_ORDER } from './constants.js';
