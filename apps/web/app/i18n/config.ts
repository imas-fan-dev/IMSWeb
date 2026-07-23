import { createInstance } from "i18next"
import { initReactI18next } from "react-i18next"

import {
  defaultLanguage,
  defaultNamespace,
  resources,
  supportedLanguages,
} from "./resources"

export const i18n = createInstance()

void i18n.use(initReactI18next).init({
  defaultNS: defaultNamespace,
  fallbackLng: defaultLanguage,
  initAsync: false,
  interpolation: {
    escapeValue: false,
  },
  lng: defaultLanguage,
  load: "currentOnly",
  ns: [defaultNamespace],
  resources,
  supportedLngs: supportedLanguages,
  react: {
    useSuspense: false,
  },
})
