import { validateBuildOptions, validateTemplate } from './PolymerValidation.js';
import { buildHeadTailPolymer } from './HeadTailPolymerBuilder.js';
import { buildHeadHeadPolymer } from './HeadHeadPolymerBuilder.js';

/** 输入连接方式、模板及总单元数/键长；输出聚合结构，不修改输入。 */
export function buildPolymer(type, template, options) {
  const parameters = validateBuildOptions(options);
  validateTemplate(template);
  if (parameters.n * template.atoms.length > 99999) throw new Error('聚合物超过 PDB 的 99999 个原子上限');
  if (type === 'head-tail') return buildHeadTailPolymer(template, parameters);
  if (type === 'head-head') return buildHeadHeadPolymer(template, parameters);
  throw new Error('未知的聚合连接方式');
}
