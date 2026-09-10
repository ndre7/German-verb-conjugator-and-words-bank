import { Languages, Check, Globe, LayoutTemplate } from "lucide-react";
import { Locale } from "../translations";

interface LanguageSettingsProps {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  isRtl: boolean;
}

export default function LanguageSettings({ locale, setLocale, isRtl }: LanguageSettingsProps) {
  const languages: { id: Locale; name: string; nativeName: string; dir: "rtl" | "ltr"; desc: string }[] = [
    {
      id: "fa",
      name: "Persian",
      nativeName: "فارسی",
      dir: "rtl",
      desc: "چیدمان راست‌چین (RTL) با قلم اصیل وزیرمتن، ترجمه‌های دقیق صیغه‌ها و معانی فارسی افعال و واژگان"
    },
    {
      id: "de",
      name: "German",
      nativeName: "Deutsch",
      dir: "ltr",
      desc: "Vollständige Benutzeroberfläche auf Deutsch mit LTR-Ausrichtung für natives Lernen"
    },
    {
      id: "en",
      name: "English",
      nativeName: "English",
      dir: "ltr",
      desc: "Standard English interface with LTR layout, international grammatical terminology"
    }
  ];

  return (
    <div className={`space-y-6 max-w-4xl mx-auto ${isRtl ? "text-right font-vazir" : "text-left"}`}>
      {/* Header */}
      <div className="bg-white border border-slate-200/90 p-6 rounded-3xl shadow-xs space-y-2">
        <div className="flex items-center gap-2 text-indigo-600">
          <Languages className="w-5 h-5" />
          <h2 className="text-lg sm:text-xl font-extrabold text-slate-900">
            {locale === "fa" ? "تنظیمات زبان برنامه" : locale === "de" ? "App-Spracheinstellungen" : "Application Language Settings"}
          </h2>
        </div>
        <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
          {locale === "fa"
            ? "زبان دلخواه خود را برای محیط کاربری، منوها، عناوین گرامری و توضیحات انتخاب فرمایید."
            : "Select your preferred application language for interface navigation, grammar labels, and hints."}
        </p>
      </div>

      {/* Language cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {languages.map((lang) => {
          const isSelected = locale === lang.id;
          return (
            <div
              key={lang.id}
              onClick={() => setLocale(lang.id)}
              className={`p-5 rounded-3xl border-2 transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between gap-4 ${
                isSelected
                  ? "border-indigo-600 bg-indigo-50/40 shadow-sm"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60"
              }`}
            >
              {isSelected && (
                <div className="absolute top-3.5 left-3.5 bg-indigo-600 text-white p-1 rounded-full shadow-2xs">
                  <Check className="w-3.5 h-3.5" />
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-xl ${isSelected ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                    <Globe className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">{lang.nativeName}</h3>
                    <span className="text-xs text-slate-400 font-medium">{lang.name}</span>
                  </div>
                </div>

                <p className="text-xs text-slate-500 leading-relaxed pt-1">
                  {lang.desc}
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1 font-mono">
                  <LayoutTemplate className="w-3.5 h-3.5" />
                  {lang.dir.toUpperCase()} Layout
                </span>

                <span className={`font-bold ${isSelected ? "text-indigo-600 font-extrabold" : "text-slate-500"}`}>
                  {isSelected ? (locale === "fa" ? "زبان فعال" : "Active") : (locale === "fa" ? "انتخاب" : "Select")}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Info note */}
      <div className="bg-slate-50 border border-slate-200/80 p-4 rounded-2xl text-xs text-slate-600 flex items-start gap-2.5">
        <Globe className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          {locale === "fa"
            ? "تغییر زبان به صورت آنی اعمال می‌گردد و نیاز به بارگذاری مجدد صفحه نخواهد بود. همچنین این تنظیم در حافظه دستگاه شما ذخیره می‌ماند."
            : "Language changes are applied immediately across all components and preserved locally for future sessions."}
        </p>
      </div>
    </div>
  );
}
