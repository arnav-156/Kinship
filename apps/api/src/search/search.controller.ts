import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import type { AuthenticatedPrincipal } from "@relationship/auth";

import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { SearchEvidenceDto, SearchProspectsDto, SearchSimilarPeopleDto } from "./dto";
import { SearchService } from "./search.service";

@UseGuards(JwtAuthGuard)
@Controller("search")
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Post("evidence")
  searchEvidence(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() input: SearchEvidenceDto,
  ) {
    return this.searchService.searchEvidence(principal, input);
  }

  @Post("prospects")
  searchProspects(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() input: SearchProspectsDto,
  ) {
    return this.searchService.searchProspects(principal, input);
  }

  @Post("similar-people")
  searchSimilarPeople(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() input: SearchSimilarPeopleDto,
  ) {
    return this.searchService.searchSimilarPeople(principal, input);
  }
}
