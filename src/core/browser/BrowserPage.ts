import { AxiosInstance, AxiosResponse } from "axios";
import cheerio from "cheerio";
import qs from "qs";
import { TypedEmitter } from "tiny-typed-emitter";
import { BrowserPageEvents } from "./BrowserPageEvents";

export class BrowserPage {
  private http: AxiosInstance;
  private url: string = "";
  private userAgent: string;
  private closed = false;
  private document?: cheerio.Root;
  private syncEventHandler?: BrowserPageEvents;

  constructor(baseUrl: string, http: AxiosInstance, userAgent: string) {
    this.url = baseUrl;
    this.userAgent = userAgent;
    this.http = http;
    if (!this.http.defaults.baseURL) {
      this.http.defaults.baseURL = baseUrl;
    }
    this.setUserAgent(userAgent);
  }

  public close() {
    this.closed = true;
  }

  public getUrl() {
    return this.url;
  }

  public refresh() {
    return this.goTo(this.url);
  }

  public setSyncEventHandler(handler: BrowserPageEvents) {
    this.syncEventHandler = handler;
  }

  public setUserAgent(userAgent: string) {
    this.userAgent = userAgent;
    // this.http.defaults.headers["user-agent"] = userAgent;
  }

  public input(selector: string, value: string) {
    if (!this.document) {
      throw new Error("No document loaded");
    }
    // const l = this.document(`[name='${selector}']`);

    // cheerio(l[l.length - 1]).val(value);
    this.document(`[name='${selector}']`).each((_, e) => cheerio(e).val(value));
  }

  public html() {
    if (!this.document) {
      throw new Error("no DOM loaded");
    }
    return this.document.html();
  }

  public selector(selector: string) {
    if (!this.document) {
      throw new Error("no DOM loaded");
    }

    return this.document(selector);
  }

  public async submitForm(
    selector: string,

    rawData?: string
  ) {
    if (this.closed) {
      return;
    }
    if (!this.document) {
      throw new Error("No document loaded");
    }
    const form = this.document(selector);
    const action = form.attr("action");
    if (!action) {
      // writeFile("noAction", this.html());
      throw new Error(`Form ${selector} on ${this.url} has no action`);
    }
    let value = qs.parse(form.serialize());
    let val = rawData;

    if (this.syncEventHandler) {
      val ??=
        (await this.syncEventHandler.willSubmitForm(
          this.url,
          action,
          rawData ? qs.parse(rawData) : value
        )) || undefined;
    }

    val ??= qs.stringify(value, {
      arrayFormat: "repeat",
    });

    return this.http
      .post(action, val, {
        maxRedirects: 0,
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          origin: new URL(this.url).origin,
          referer: this.url,
        },
      })
      .then(async (r) => await this.switchDocNormal(r))
      .catch(async (e) => {
        const location = e.response?.headers["location"];
        if (location) {
          await this.goTo(location);
        } else {
          throw e;
        }
      });
  }

  public async goTo(url: string, followRedirect: boolean = true) {
    if (this.closed) {
      return;
    }
    if (this.syncEventHandler?.willNavigate) {
      this.syncEventHandler.willNavigate(url);
    }
    return this.http
      .get(url, {
        ...(!followRedirect ? { maxRedirects: 0 } : {}),
      })
      .then(async (r) => {
        await this.switchDocNormal(r);
      })
      .catch(async (e) => {
        if (followRedirect) {
          await this.switchDocHeader(e);
        } else {
          console.error(e);
          throw e;
        }
      });
  }

  private async switchDocNormal(r: AxiosResponse<any>) {
    const previousUrl = this.url;

    this.url =
      r.config.url ?? r.request.res?.responseUrl ?? r.request?.path ?? this.url;

    this.document = cheerio.load(r.data ?? ``);
    // console.log("Navigated! to ", this.url, "from", previousUrl);
    if (this.syncEventHandler) {
      await this.syncEventHandler.didNavigate(previousUrl);
    }
  }

  private async switchDocHeader(e: any) {
    const location = e.response?.headers["location"];
    if (location) {
      const previousUrl = this.url;
      this.url = location;
      this.document = cheerio.load(``);
      //   console.log("Navigated! to ", this.url, "from", previousUrl);

      if (this.syncEventHandler) {
        await this.syncEventHandler.didNavigate(previousUrl);
      }
    } else {
      throw e;
    }
  }
}
