import { ActionConfig, LovelaceCard, LovelaceCardConfig, LovelaceCardEditor } from 'custom-card-helpers';

declare global {
  interface HTMLElementTagNameMap {
    'citymapper-nycsubway-card-editor': LovelaceCardEditor;
    'hui-error-card': LovelaceCard;
  }
}
export interface BoilerplateCardConfig extends LovelaceCardConfig {
  type: string;
  name?: string;
  entities: string[];
  trains_of_interest: string[];
  tap_action?: ActionConfig;
  hold_action?: ActionConfig;
  double_tap_action?: ActionConfig;
}

export type Departure = {
  station: string,
  departure_string: string,
  departure: Date,
  frequencies: number[],
  express: boolean,
  extrapolated: boolean
};

