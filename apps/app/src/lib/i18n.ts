import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from '#locales/en.json' with { type: 'json' }
import es from '#locales/es.json' with { type: 'json' }
import ja from '#locales/ja.json' with { type: 'json' }
import ko from '#locales/ko.json' with { type: 'json' }
import zh from '#locales/zh.json' with { type: 'json' }

export const supportedLanguages = [
	{ code: 'en', name: 'English' },
	{ code: 'es', name: 'Español' },
	{ code: 'zh', name: '中文' },
	{ code: 'ja', name: '日本語' },
	{ code: 'ko', name: '한국어' },
] as const

export type LanguageCode = (typeof supportedLanguages)[number]['code']

const resources = {
	en: { translation: en },
	es: { translation: es },
	zh: { translation: zh },
	ja: { translation: ja },
	ko: { translation: ko },
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
