module.exports = {
  preset: 'react-native',
  // AsyncStorage is a native module, absent under Jest. Every module that
  // keeps a store imports it, so any test reaching one (the player does,
  // through songChoice) gets the library's own in-memory mock.
  moduleNameMapper: {
    '^@react-native-async-storage/async-storage$':
      '@react-native-async-storage/async-storage/jest/async-storage-mock',
  },
};
