class TranslationLanguage {
  final String code;
  final String name;

  const TranslationLanguage(this.code, this.name);

  static const english = TranslationLanguage('eng_Latn', 'English');

  static const supported = <TranslationLanguage>[
    english,
    TranslationLanguage('asm_Beng', 'Assamese'),
    TranslationLanguage('ben_Beng', 'Bengali'),
    TranslationLanguage('brx_Deva', 'Bodo'),
    TranslationLanguage('doi_Deva', 'Dogri'),
    TranslationLanguage('gom_Deva', 'Konkani'),
    TranslationLanguage('guj_Gujr', 'Gujarati'),
    TranslationLanguage('hin_Deva', 'Hindi'),
    TranslationLanguage('kan_Knda', 'Kannada'),
    TranslationLanguage('kas_Arab', 'Kashmiri (Arabic)'),
    TranslationLanguage('kas_Deva', 'Kashmiri (Devanagari)'),
    TranslationLanguage('mai_Deva', 'Maithili'),
    TranslationLanguage('mal_Mlym', 'Malayalam'),
    TranslationLanguage('mar_Deva', 'Marathi'),
    TranslationLanguage('mni_Beng', 'Manipuri (Bengali)'),
    TranslationLanguage('mni_Mtei', 'Manipuri (Meitei)'),
    TranslationLanguage('npi_Deva', 'Nepali'),
    TranslationLanguage('ory_Orya', 'Odia'),
    TranslationLanguage('pan_Guru', 'Punjabi'),
    TranslationLanguage('san_Deva', 'Sanskrit'),
    TranslationLanguage('sat_Olck', 'Santali'),
    TranslationLanguage('snd_Arab', 'Sindhi (Arabic)'),
    TranslationLanguage('snd_Deva', 'Sindhi (Devanagari)'),
    TranslationLanguage('tam_Taml', 'Tamil'),
    TranslationLanguage('tel_Telu', 'Telugu'),
    TranslationLanguage('urd_Arab', 'Urdu'),
  ];

  static TranslationLanguage? byCode(String code) {
    for (final language in supported) {
      if (language.code == code) return language;
    }
    return null;
  }
}