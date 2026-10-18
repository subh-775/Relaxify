/**
 * The languages Home and Browse are drawn from: JioSaavn's catalogue languages,
 * each with its name in its own script (the Home tuner shows those), and how
 * the app names them in a list.
 */
/** JioSaavn's catalogue languages, the ones most people pick first. */
export const LANGUAGES: [string, string][] = [
  ['hindi', 'हिन्दी'],
  ['english', 'English'],
  ['punjabi', 'ਪੰਜਾਬੀ'],
  ['tamil', 'தமிழ்'],
  ['telugu', 'తెలుగు'],
  ['malayalam', 'മലയാളം'],
  ['marathi', 'मराठी'],
  ['gujarati', 'ગુજરાતી'],
  ['bengali', 'বাংলা'],
  ['kannada', 'ಕನ್ನಡ'],
  ['bhojpuri', 'भोजपुरी'],
  ['urdu', 'اردو'],
  ['haryanvi', 'हरियाणवी'],
  ['rajasthani', 'राजस्थानी'],
  ['odia', 'ଓଡ଼ିଆ'],
  ['assamese', 'অসমীয়া'],
];

export const languageName = (l: string) =>
  l.charAt(0).toUpperCase() + l.slice(1);

/** How a language is named in a list: English is "International", as
 *  JioSaavn's English catalogue is the world's music. */
export const languageLabel = (l: string) =>
  l === 'english' ? 'International' : languageName(l);

/** "Hindi, International", for a row's value. */
export const languagesLabel = (ls: string[]) =>
  ls.map(languageLabel).join(', ');
