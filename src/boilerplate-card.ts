/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  LitElement,
  html,
  TemplateResult,
  css,
  PropertyValues,
  CSSResultGroup,
} from 'lit';
import { customElement, property, state } from "lit/decorators";
import {
  HomeAssistant,
  hasAction,
  ActionHandlerEvent,
  handleAction,
  LovelaceCardEditor,
} from 'custom-card-helpers'; // This is a community maintained npm module with common helper functions/types. https://github.com/custom-cards/custom-card-helpers

import './editor';

import type { BoilerplateCardConfig } from './types';
import type { Departure } from './types';
import { actionHandler } from './action-handler-directive';
import { CARD_VERSION } from './const';
import { localize } from './localize/localize';

/* eslint no-console: 0 */
console.info(
  `%c  CITYMAPPER-NYCSUBWAY-CARD \n%c  ${localize('common.version')} ${CARD_VERSION}    `,
  'color: orange; font-weight: bold; background: black',
  'color: white; font-weight: bold; background: dimgray',
);

// This puts your card into the UI card picker dialog
(window as any).customCards = (window as any).customCards || [];
(window as any).customCards.push({
  type: 'citymapper-nycsubway-card',
  name: 'CityMapper NYC Subway Card',
  description: 'Custom card presenting specific NYC subway trains from specific CityMapper API call(s): https://docs.external.citymapper.com/api/ (v1.2.0)',
});

@customElement('citymapper-nycsubway-card')
export class BoilerplateCard extends LitElement {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    return document.createElement('citymapper-nycsubway-card-editor');
  }

  public static getStubConfig(): Record<string, unknown> {
    return {};
  }

  // TODO Add any properities that should cause your element to re-render here
  // https://lit.dev/docs/components/properties/
  @property({ attribute: false }) public hass!: HomeAssistant;
  @state() private config!: BoilerplateCardConfig;

  // https://lit.dev/docs/components/properties/#accessors-custom
  public setConfig(config: BoilerplateCardConfig): void {
    if (!config) {
      throw new Error(localize('common.invalid_configuration'));
    }
    if (!config.entities || !Array.isArray(config.entities) || !config.entities[0]) {
      throw new Error(localize('common.missing_entites'));
    }

    this.config = {
      name: 'CityMapper NYC Subway',
      ...config,
    };
  }

  // https://lit.dev/docs/components/lifecycle/#reactive-update-cycle-performing
  protected shouldUpdate(changedProps: PropertyValues): boolean {
    if (!this.config) {
      return false;
    }

    if (changedProps.has('config')) {
      return true;
    }

    if (this.config.entities) {
      const oldHass = changedProps.get('hass') as HomeAssistant | undefined;
      if (oldHass) {
        for (const entity of this.config.entities) {
          if (Boolean(this.hass && oldHass.states[entity] !== this.hass.states[entity])) {
            return true;
          }
        }
        return false;
      }
      return true;
    } else {
      return false;
    }
  }

  // https://lit.dev/docs/components/rendering/
  protected render(): TemplateResult | void {
    // TODO Check for stateObj or other necessary things and render a warning if missing
    if (this.config.show_warning) {
      return this._showWarning(localize('common.show_warning'));
    }

    console.log("Hello from the citymapper trains card!");
    const trainsMapping = this._generateTrainsMapping();

    // Now that each train may have a mapping (or multiple), sort them and extrapolate more train times
    // Then store HTML for each departure in template arrays
    const trainsHtml = {};
    this.config.trains_of_interest.forEach(train => trainsHtml[train.toString()] = []);

    Object.keys(trainsMapping).map((train) => {
      const departureObjects: Departure[] = trainsMapping[train];
      if (departureObjects.length > 0) {

        departureObjects.sort((a, b) => a.departure < b.departure ? -1 : 1);

        // Annoying: Have to store previousDetails in order to extrapolate future train times
        // But want to avoid an express train if possible for extrapolation, that may mess the times up
        const possiblePrevDetailsArray = departureObjects.filter(d => !d.express);
        const previousDetails = possiblePrevDetailsArray.length > 0
          // not using `.at(-1)` to avoid "undefined" or "illegal assertion" issues. This language is stupid.
          ? possiblePrevDetailsArray[possiblePrevDetailsArray.length - 1]
          : departureObjects[departureObjects.length - 1];

        trainsHtml[train].push(this._getDepartureHtml(departureObjects[0], true));

        // leave departureObjects intact
        const depObjectsCopy = [...departureObjects];
        depObjectsCopy.splice(0, 1);
        depObjectsCopy.forEach(
          departureObject => trainsHtml[train].push(this._getDepartureHtml(departureObject, false))
        );

        [...Array(3)].forEach(_ => {
          const nextTime = new Date(previousDetails.departure);
          nextTime.setSeconds(nextTime.getSeconds() + previousDetails.frequencies[0]);
          if (trainsHtml[train].length < 4) {
            trainsHtml[train].push(this._getDepartureHtml({
              station: previousDetails.station,
              departure: nextTime,
              departure_string: "",  // included empty-string to satisfy angry gods
              frequencies: previousDetails.frequencies,
              express: previousDetails.express,
              extrapolated: true
            },
              false
            ));
          }
          previousDetails.departure = nextTime;
        });

      } else {
        trainsHtml[train].push(html`<span class="departure nodata">${localize("common.no_train")}</span>`);
      }
    });

    // Put it all together for each train
    const totalHtml: TemplateResult[] = [];
    Object.keys(trainsHtml).forEach((train, i) => {
      const baseHtml = html`
          <div class="train ${train}">
            <span class="image"><img src="/local/custom-lovelace/nyc-subway-card/trains/${train}.svg" height=20px /></span>
            <span class="departures-wrapper">
              <span class="departures">
                ${trainsHtml[train].map((departure) =>
                  html`${departure}`
                )}
              </span>
            </span>
          </div>
      `;

      if (i < Object.keys(trainsHtml).length - 1) {
        totalHtml.push(html`
          ${baseHtml}
          <div class="trains-separator"></div>
        `);
      } else {
        totalHtml.push(baseHtml);
      }
    });

    // Aaaaaand good to go!
    return html`
      <ha-card
        @action=${this._handleAction}
        .actionHandler=${actionHandler({  // To do: do I want extra info on action? that is a long way off. screw it for now.
          hasHold: hasAction(this.config.hold_action),
          hasDoubleClick: hasAction(this.config.double_tap_action),
        })}
        tabindex="0"
        .label=${`New York City Subway: ${this.config.entities || 'No Entities Defined'}`}
      >

        <!-- Card Header -->
        <div>
          <svg class="mta" width="47" height = "51" xmlns = "http://www.w3.org/2000/svg">
            <path d="M29.909 21.372l-2.743-.234v14.56l-4.088.724-.01-15.644-3.474-.308v-5.734l10.315 1.803v4.833zm7.785 12.484l-2.426.421-.283-2.122-2.363.307-.296 2.335-3.125.553 3.094-18.36 2.937.51 2.462 16.356zm-3.141-5.288l-.65-5.606h-.142l-.658 5.691 1.45-.085zM21.038 50.931c13.986 0 25.32-11.402 25.32-25.465C46.359 11.4 35.025 0 21.039 0 12.27 0 4.545 4.483 0 11.296l7.017 1.237 1.931 14.78c.007-.024.14-.009.14-.009l2.118-14.036 7.022 1.229V37.28l-4.432.776v-9.79s.164-4.217.067-4.938c0 0-.193.005-.196-.011l-2.644 15.236-4.403.777-3.236-16.412-.195-.014c-.069.594.237 5.744.237 5.744v11.243L.532 40.4c4.603 6.38 12.072 10.53 20.506 10.53v.001z"></path>
          </svg>
          <span class="title" style="display: inline-block;">${this.config.name}</span>
        </div>

        <!-- Each train's info -->
        <div id="nyc-subway-trains-departure-table">
          ${totalHtml.map(value =>
            html`${value}`
          )}
        </div>
        <div class="legend">&#8519; = ${localize("common.extrapolated")}, &#120169; = ${localize("common.express")}</div>
      </ha-card>
    `;
  }

  /**
   * Generate HTML for each departure for each train.
   */
  private _getDepartureHtml(departureObject: Departure, first: boolean): any {
    const minsCountdown = new MinsCountdown();
    minsCountdown.departureTime = departureObject.departure;
    return html`
        <span class="${first ? 'first' : ''} departure">
          <span class="time">${this._getTimeStr(departureObject.departure)}</span>
          ${ minsCountdown }
          <span class="station">${first
            ? localize("trains.station." + departureObject.station)
            : localize("trains.station_short." + departureObject.station)}</span>
          ${departureObject.express ? html`<span class="express">&#120169;</span>` : ''}
          ${departureObject.extrapolated ? html`<span class="extrapolated">&#8519;</span>` : ''}
        </span>
      `;
  }

  /**
   * Get a time string of the form "8:59 PM" from the input Date.
   */
  private _getTimeStr(date: Date): string {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  /**
   * Generate the trainsMapping object. The object should contain a key for each
   * configured "train of interest", then after checking the HASS entity attributes
   * for departure times linked to any of those trains, have a list of departure
   * times for each train-key.
   */
  private _generateTrainsMapping(): any {
    const trainsMapping = {};
    this.config.trains_of_interest.forEach(train => trainsMapping[train.toString()] = []);

    // For each entity, go through the train schedules and add them to the trainsMapping
    this.config.entities.forEach(entity => {
      const routes = this.hass.states[entity].attributes["routes"];

      routes.forEach(route => {
        const metroLeg = route["legs"][1];
        if (metroLeg["vehicle_types"].indexOf("metro") > -1) {  // subway

          let train = metroLeg.updatable_detail.departures[0].service_id.toString();
          // Handle express syntax like "5X"
          let express = false;
          if (train.match(/^[A-Z0-9]X$/)) {
            train = train.substr(0, 1);
            express = true;
          }

          // Avoid storing duplicate departures
          if (trainsMapping[train] && trainsMapping[train].filter((departureObj: Departure) =>
              departureObj.station == metroLeg.stops[0].id
              && departureObj.departure_string == metroLeg.updatable_detail.leg_departure_time)
              .length == 0) {
            trainsMapping[train].push({
              station: metroLeg.stops[0].id,
              departure_string: metroLeg.updatable_detail.leg_departure_time,
              departure: new Date(metroLeg.updatable_detail.leg_departure_time),
              frequencies: metroLeg.updatable_detail.departures[0].frequency_seconds_range,
              express: express,
              extrapolated: false
            });
            console.log("Mapping addded for " + train);
            console.log(trainsMapping[train].at(-1));
          } else {
            console.log("Skipped mapping for train: " + train);
          }
        }
      });
    });
    console.log(trainsMapping);
    return trainsMapping;
  }

  private _handleAction(ev: ActionHandlerEvent): void {
    if (this.hass && this.config && ev.detail.action) {
      handleAction(this, this.hass, this.config, ev.detail.action);
    }
  }

  private _showWarning(warning: string): TemplateResult {
    return html`
      <hui-warning>${warning}</hui-warning>
    `;
  }

  private _showError(error: string): TemplateResult {
    const errorCard = document.createElement('hui-error-card');
    errorCard.setConfig({
      type: 'error',
      error,
      origConfig: this.config,
    });
    return html`
      ${errorCard}
    `;
  }

  // https://lit.dev/docs/components/styles/
  static get styles(): CSSResultGroup {
    return css`
      svg.mta {
        padding-left: 24px;
        padding-top: 20px;
        padding-bottom: 6px;
        overflow: visible;
        fill: var(--primary-text-color);
      }
      .title {
        position: absolute;
        left: 1.8em;
        font-weight: 300;
        font-size: 3em;
        top: 38px;
        color: var(--primary-text-color);
      }
      div.train {
        width: 90%;
      }
      span.image {
        position: absolute;
        left: 30px;
        padding-top: 8px;
      }
      span.departures-wrapper {
        margin: 0px auto;
        width: 98%;
      }
      div.trains-separator {
        border-bottom: 0.1em solid rgb(217, 217, 217);
        margin: 0px 30px;
      }
      span.departures {
        display: flex;
        width: 100%;
        padding: 5px 0px 2px 50px;
      }
      span.departure {
        width: 100%;
        text-align: center;
        padding: 0px 2px 0px 2px;
      }
      span.time {
        font-size: medium;
        font-weight: 600;
        text-transform: lowercase;
        display: block;
        margin-bottom: -2px;
      }
      span.station {
        display: inline-block;
        font-size: smaller;
      }
      span.express, span.extrapolated {
        display: inline-block;
      }
      span.nodata {
        padding: 3px 30px 28px 0px;
      }
      div.legend {
        font-size: x-small;
        font-weight: 200;
        text-align: right;
        padding-right: 16px;
        margin-top: -5px;
      }
    `;
  }
}

/**
 * Class to hold the minutes until the train departs, allowing the countdown
 * to be successfully re-rendered every 5 seconds.
 */
@customElement("mins-countdown-cm-subway")
export class MinsCountdown extends LitElement {

  _defaultDeparture = new Date("2020-12-31 23:59:59");
  @state() departureTime: Date = this._defaultDeparture;
  @state() private mins = '0 mins';

  protected render(): TemplateResult | void {
    // Update the element every 5 seconds
    setInterval(() => this._updateMins(), 5000);
    this.mins = this._minuteDifference(this.departureTime);
    return html`
      <span class="countdown ${this.mins ? "" : "empty"}">${this.mins}</span>
    `;
  }

  _updateMins(): void {
    this.mins = this._minuteDifference(this.departureTime);
  }

  private _minuteDifference(date: Date): string {
    const diff = Math.round((date.getTime() - Date.now()) / 60000);
    return diff <= 0 ? "" : diff == 1 ? diff + " min" : diff + " mins";
  }

  static styles = css`
    span.countdown {
      display: block;
      font-size: smaller;
      font-style: italic;
      margin-bottom: -8px;
    }
    span.empty {
      margin-bottom: 12px;
    }
  `;
}
