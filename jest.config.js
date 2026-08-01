module.exports = {
    preset: "ts-jest",
    testEnvironment: "jsdom",
    moduleDirectories: ["node_modules", "src"],
    moduleNameMapper: {
        // `obsidian` is types-only on npm, the runtime lives in the app.
        "^obsidian$": "<rootDir>/src/test/mocks/obsidian.ts",
        // Source files import each other as "src/..." - see tsconfig baseUrl.
        "^src/(.*)$": "<rootDir>/src/$1",
    },
};