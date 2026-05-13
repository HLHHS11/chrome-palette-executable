// text-fragments-polyfillパッケージに対する型定義ファイル。
declare module "text-fragments-polyfill/dist/fragment-generation-utils.js" {
  export const GenerateFragmentStatus: {
    readonly SUCCESS: 0;
    readonly INVALID_SELECTION: 1;
    readonly AMBIGUOUS: 2;
    readonly TIMEOUT: 3;
    readonly EXECUTION_FAILED: 4;
  };

  export function generateFragment(selection: Selection): {
    status: number;
    fragment?: {
      textStart: string;
      textEnd?: string;
      prefix?: string;
      suffix?: string;
    };
  };
}
