import { Module } from "@nestjs/common";
import { CurrentShiftController } from "./current-shift.controller.js";
import { CurrentShiftService } from "./current-shift.service.js";

@Module({
  controllers: [CurrentShiftController],
  providers: [{
    provide: CurrentShiftService,
    useFactory: () => new CurrentShiftService()
  }],
  exports: [CurrentShiftService]
})
export class CurrentShiftModule {}
