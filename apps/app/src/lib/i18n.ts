import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import ar from '#locales/ar.json' with { type: 'json' }
import el from '#locales/el.json' with { type: 'json' }
import en from '#locales/en.json' with { type: 'json' }
import es from '#locales/es.json' with { type: 'json' }
import he from '#locales/he.json' with { type: 'json' }
import ja from '#locales/ja.json' with { type: 'json' }
import ko from '#locales/ko.json' with { type: 'json' }
import zh from '#locales/zh.json' with { type: 'json' }

export const supportedLanguages = [
	{ code: 'en', name: 'English', dir: 'ltr' },
	{ code: 'ar', name: 'العربية', dir: 'rtl' },
	{ code: 'el', name: 'Ελληνικά', dir: 'ltr' },
	{ code: 'es', name: 'Español', dir: 'ltr' },
	{ code: 'he', name: 'עברית', dir: 'rtl' },
	{ code: 'ja', name: '日本語', dir: 'ltr' },
	{ code: 'ko', name: '한국어', dir: 'ltr' },
	{ code: 'zh', name: '中文', dir: 'ltr' },
] as const

export type LanguageCode = (typeof supportedLanguages)[number]['code']

export const rtlLanguages = new Set(
	supportedLanguages.filter((l) => l.dir === 'rtl').map((l) => l.code),
)

export function isRtl(lang: string): boolean {
	return rtlLanguages.has(lang)
}

const resources = {
	ar: { translation: ar },
	el: { translation: el },
	en: { translation: en },
	es: { translation: es },
	he: { translation: he },
	ja: { translation: ja },
	ko: { translation: ko },
	zh: { translation: zh },
}

i18n.use(initReactI18next).init({
	resources,
	lng: 'en',
	fallbackLng: 'en',
	interpolation: {
		escapeValue: false,
	},
})

export default i18n
