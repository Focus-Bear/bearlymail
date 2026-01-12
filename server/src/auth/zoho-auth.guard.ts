import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

@Injectable()
export class ZohoAuthGuard extends AuthGuard("zoho") {}


