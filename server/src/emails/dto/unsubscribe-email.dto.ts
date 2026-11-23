import { IsIn } from "class-validator";

import {
  UNSUBSCRIBE_METHODS,
  UnsubscribeMethod,
} from "../../constants/unsubscribe.constants";

export class UnsubscribeEmailDto {
  /** The method the user confirmed; the server refuses to use any other. */
  @IsIn(Object.values(UNSUBSCRIBE_METHODS))
  method: UnsubscribeMethod;
}
