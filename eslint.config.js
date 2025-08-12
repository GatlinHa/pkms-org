import vue from "eslint-plugin-vue";
import typescriptESLintParser from "@typescript-eslint/parser";
import typescriptESLintPlugin from "@typescript-eslint/eslint-plugin";
import vueParser from "vue-eslint-parser"; // 添加 Vue 解析器
import prettier from "eslint-config-prettier";
import prettierPlugin from "eslint-plugin-prettier";
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default [
  {
    files: ["**/*.vue", "**/*.js", "**/*.mjs", "**/*.ts", "**/*.mts"],
    plugins: {
      vue: vue,
      "@typescript-eslint": typescriptESLintPlugin,
      prettier: prettierPlugin,
    },
    languageOptions: {
      parser: vueParser, // 使用 vue-eslint-parser 作为主解析器
      parserOptions: {
        parser: typescriptESLintParser,
        ecmaVersion: "latest",
        sourceType: "module",
        project: "./tsconfig.json",
        extraFileExtensions: ['.vue'], // 添加 .vue 文件扩展名支持
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      ...vue.configs.recommended.rules, // 引入 Vue 的推荐规则
      "vue/multi-word-component-names": "off", // 关闭多单词组件名规则

      // 处理 TypeScript 变量
      "@typescript-eslint/no-unused-vars": ["error", {
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_",
        "caughtErrorsIgnorePattern": "^_"
      }],

      "no-console": process.env.NODE_ENV === "production" ? "warn" : "off",
      "no-debugger": process.env.NODE_ENV === "production" ? "warn" : "off",
      "prettier/prettier": [
        "warn",
        {
          singleQuote: true, // 单引号
          tabWidth: 2, // 缩进为2个空格
          useTabs: false, // 不使用制表符(Tab)缩进
          semi: false, // 无分号
          printWidth: 120, // 每行宽度至多100字符
          bracketSpacing: true, // 对象字面量的大括号内添加空格（如 `{ key: value }` 而非 `{key: value}`）
          arrowParens: "always", // 箭头函数参数始终使用括号（如 `(x) => x` 而非 `x => x`）
          trailingComma: "none", // 不加对象|数组最后逗号
          endOfLine: "auto", // 换行符号不限制（win mac 不一致）
        },
      ],
    },
  },
  {
    // 添加忽略项
    ignores: [
      "node_modules/**", // 忽略 node_modules 目录下的所有文件
      "dist/**", // 忽略 dist 目录下的所有文件
      ".vitepress/cache/**", // 忽略 vitepress/cache 目录下的所有文件
      "public/**", // 忽略 public 目录下的所有文件
      "eslint.config.js", // 忽略 ESLint 配置文件
    ],
  },
  // {
  //   files: ["**/*.md"],
  //   plugins: {
  //     markdown: markdownPlugin,
  //   },
  //   processor: "markdown/markdown",
  // },
  prettier, // 放在最后以确保 Prettier 规则生效
];
