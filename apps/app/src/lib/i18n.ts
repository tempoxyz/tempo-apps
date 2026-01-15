import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import ar from '#locales/ar.json' with { type: 'json' }
import bn from '#locales/bn.json' with { type: 'json' }
import cs from '#locales/cs.json' with { type: 'json' }
import da from '#locales/da.json' with { type: 'json' }
import de from '#locales/de.json' with { type: 'json' }
import el from '#locales/el.json' with { type: 'json' }
import en from '#locales/en.json' with { type: 'json' }
import eo from '#locales/eo.json' with { type: 'json' }
import es from '#locales/es.json' with { type: 'json' }
import fa from '#locales/fa.json' with { type: 'json' }
import fi from '#locales/fi.json' with { type: 'json' }
import fil from '#locales/fil.json' with { type: 'json' }
import fr from '#locales/fr.json' with { type: 'json' }
import he from '#locales/he.json' with { type: 'json' }
import hi from '#locales/hi.json' with { type: 'json' }
import hu from '#locales/hu.json' with { type: 'json' }
import id from '#locales/id.json' with { type: 'json' }
import it from '#locales/it.json' with { type: 'json' }
import ja from '#locales/ja.json' with { type: 'json' }
import ko from '#locales/ko.json' with { type: 'json' }
import ms from '#locales/ms.json' with { type: 'json' }
import nl from '#locales/nl.json' with { type: 'json' }
import no from '#locales/no.json' with { type: 'json' }
import pl from '#locales/pl.json' with { type: 'json' }
import pt from '#locales/pt.json' with { type: 'json' }
import ro from '#locales/ro.json' with { type: 'json' }
import ru from '#locales/ru.json' with { type: 'json' }
import sv from '#locales/sv.json' with { type: 'json' }
import th from '#locales/th.json' with { type: 'json' }
import tr from '#locales/tr.json' with { type: 'json' }
import uk from '#locales/uk.json' with { type: 'json' }
import vi from '#locales/vi.json' with { type: 'json' }
import zh from '#locales/zh.json' with { type: 'json' }

export const supportedLanguages = [
	{ code: 'en', name: 'English', set: 'Set', active: 'Active', dir: 'ltr' },
	{ code: 'ar', name: 'العربية', set: 'تعيين', active: 'نشط', dir: 'rtl' },
	{ code: 'bn', name: 'বাংলা', set: 'সেট করুন', active: 'সক্রিয়', dir: 'ltr' },
	{ code: 'cs', name: 'Čeština', set: 'Nastavit', active: 'Aktivní', dir: 'ltr' },
	{ code: 'da', name: 'Dansk', set: 'Indstil', active: 'Aktiv', dir: 'ltr' },
	{ code: 'de', name: 'Deutsch', set: 'Festlegen', active: 'Aktiv', dir: 'ltr' },
	{ code: 'el', name: 'Ελληνικά', set: 'Ορισμός', active: 'Ενεργό', dir: 'ltr' },
	{ code: 'eo', name: 'Esperanto', set: 'Agordi', active: 'Aktiva', dir: 'ltr' },
	{ code: 'es', name: 'Español', set: 'Establecer', active: 'Activo', dir: 'ltr' },
	{ code: 'fa', name: 'فارسی', set: 'تنظیم', active: 'فعال', dir: 'rtl' },
	{ code: 'fi', name: 'Suomi', set: 'Aseta', active: 'Aktiivinen', dir: 'ltr' },
	{ code: 'fil', name: 'Filipino', set: 'Itakda', active: 'Aktibo', dir: 'ltr' },
	{ code: 'fr', name: 'Français', set: 'Définir', active: 'Actif', dir: 'ltr' },
	{ code: 'he', name: 'עברית', set: 'הגדר', active: 'פעיל', dir: 'rtl' },
	{ code: 'hi', name: 'हिन्दी', set: 'सेट करें', active: 'सक्रिय', dir: 'ltr' },
	{ code: 'hu', name: 'Magyar', set: 'Beállít', active: 'Aktív', dir: 'ltr' },
	{ code: 'id', name: 'Bahasa Indonesia', set: 'Atur', active: 'Aktif', dir: 'ltr' },
	{ code: 'it', name: 'Italiano', set: 'Imposta', active: 'Attivo', dir: 'ltr' },
	{ code: 'ja', name: '日本語', set: '設定', active: 'アクティブ', dir: 'ltr' },
	{ code: 'ko', name: '한국어', set: '설정', active: '활성', dir: 'ltr' },
	{ code: 'ms', name: 'Bahasa Melayu', set: 'Tetapkan', active: 'Aktif', dir: 'ltr' },
	{ code: 'nl', name: 'Nederlands', set: 'Instellen', active: 'Actief', dir: 'ltr' },
	{ code: 'no', name: 'Norsk', set: 'Angi', active: 'Aktiv', dir: 'ltr' },
	{ code: 'pl', name: 'Polski', set: 'Ustaw', active: 'Aktywny', dir: 'ltr' },
	{ code: 'pt', name: 'Português', set: 'Definir', active: 'Ativo', dir: 'ltr' },
	{ code: 'ro', name: 'Română', set: 'Setează', active: 'Activ', dir: 'ltr' },
	{ code: 'ru', name: 'Русский', set: 'Установить', active: 'Активен', dir: 'ltr' },
	{ code: 'sv', name: 'Svenska', set: 'Ställ in', active: 'Aktiv', dir: 'ltr' },
	{ code: 'th', name: 'ไทย', set: 'ตั้งค่า', active: 'ใช้งานอยู่', dir: 'ltr' },
	{ code: 'tr', name: 'Türkçe', set: 'Ayarla', active: 'Aktif', dir: 'ltr' },
	{ code: 'uk', name: 'Українська', set: 'Встановити', active: 'Активний', dir: 'ltr' },
	{ code: 'vi', name: 'Tiếng Việt', set: 'Đặt', active: 'Đang hoạt động', dir: 'ltr' },
	{ code: 'zh', name: '中文', set: '设置', active: '活跃', dir: 'ltr' },
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
	bn: { translation: bn },
	cs: { translation: cs },
	da: { translation: da },
	de: { translation: de },
	el: { translation: el },
	en: { translation: en },
	eo: { translation: eo },
	es: { translation: es },
	fa: { translation: fa },
	fi: { translation: fi },
	fil: { translation: fil },
	fr: { translation: fr },
	he: { translation: he },
	hi: { translation: hi },
	hu: { translation: hu },
	id: { translation: id },
	it: { translation: it },
	ja: { translation: ja },
	ko: { translation: ko },
	ms: { translation: ms },
	nl: { translation: nl },
	no: { translation: no },
	pl: { translation: pl },
	pt: { translation: pt },
	ro: { translation: ro },
	ru: { translation: ru },
	sv: { translation: sv },
	th: { translation: th },
	tr: { translation: tr },
	uk: { translation: uk },
	vi: { translation: vi },
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
