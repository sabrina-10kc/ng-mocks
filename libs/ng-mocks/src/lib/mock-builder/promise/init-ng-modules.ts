import { flatten, mapValues } from '../../common/core.helpers';
import funcGetProvider from '../../common/func.get-provider';
import { isNgDef } from '../../common/func.is-ng-def';
import ngMocksUniverse from '../../common/ng-mocks-universe';
import markProviders from '../../mock-module/mark-providers';
import funcGetName from '../../common/func.get-name';
import { AnyDeclaration } from '../../common/core.types';
import coreReflectProvidedIn from '../../common/core.reflect.provided-in';

import initModule from './init-module';
import { BuilderData, NgMeta } from './types';

const handleDef = ({ imports, declarations, providers }: NgMeta, def: any, defProviders: Map<any, any>): void => {
  let touched = false;

  if (isNgDef(def, 'm')) {
    const extendedDef = initModule(def, defProviders);
    imports.push(extendedDef);

    // adding providers to touches
    if (typeof extendedDef === 'object' && extendedDef.providers) {
      for (const provider of flatten(extendedDef.providers)) {
        ngMocksUniverse.touches.add(funcGetProvider(provider));
      }
    }
    touched = true;
  }

  if (isNgDef(def, 'c') || isNgDef(def, 'd') || isNgDef(def, 'p')) {
    declarations.push(ngMocksUniverse.getBuildDeclaration(def));
    touched = true;
  }

  if (isNgDef(def, 'i') || isNgDef(def, 't') || typeof def === 'string') {
    const mock = ngMocksUniverse.builtProviders.get(def);
    if (mock && typeof mock !== 'string' && isNgDef(mock, 't') === false) {
      providers.push(mock);
    }
    touched = true;
  }

  if (touched) {
    ngMocksUniverse.touches.add(def);
  }
};

export default (
  { configDef, configDefault, keepDef, mockDef, replaceDef }: BuilderData,
  defProviders: Map<any, any>,
): NgMeta => {
  const meta: NgMeta = { imports: [], declarations: [], providers: [] };

  const forgotten: AnyDeclaration<any>[] = [];

  // Adding suitable leftovers.
  for (const def of [...mapValues(mockDef), ...mapValues(keepDef), ...mapValues(replaceDef)]) {
    const configInstance = ngMocksUniverse.configInstance.get(def);
    const config = configDef.get(def);

    if (!config.dependency && config.export && !configInstance?.exported && (isNgDef(def, 'i') || !isNgDef(def))) {
      handleDef(meta, def, defProviders);
      markProviders([def]);
    } else if (!ngMocksUniverse.touches.has(def) && !config.dependency) {
      handleDef(meta, def, defProviders);
    } else if (
      config.dependency &&
      configDefault.dependency &&
      coreReflectProvidedIn(def) !== 'root' &&
      (typeof def !== 'object' || !(def as any).__ngMocksSkip)
    ) {
      forgotten.push(def);
    }
  }

  // Checking missing dependencies
  const globalFlags = ngMocksUniverse.global.get('flags');
  for (const def of forgotten) {
    if (ngMocksUniverse.touches.has(def)) {
      continue;
    }

    const errorMessage = [
      `MockBuilder has found a missing dependency: ${funcGetName(def)}.`,
      'It means no module provides it.',
      'Please, use the "export" flag if you want to add it explicitly.',
      'https://ng-mocks.sudo.eu/api/MockBuilder#export-flag',
    ].join(' ');

    if (globalFlags.onMockBuilderMissingDependency === 'warn') {
      console.warn(errorMessage);
    } else if (globalFlags.onMockBuilderMissingDependency === 'throw') {
      throw new Error(errorMessage);
    }
  }

  return meta;
};
