export interface BrowserPageEvents {
  willNavigate?: (url: string) => void;
  didNavigate: (previousUrl: string) => void;
  willSubmitForm: (url: string, action: string, value: any) => void | string;
}
