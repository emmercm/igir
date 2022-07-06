import {Expose, plainToInstance, Type} from "class-transformer";
import 'reflect-metadata';

// http://www.logiqx.com/Dats/datafile.dtd

export class ClrMamePro {
    private header?: string

    @Expose({ name: 'forcemerging' })
    private forceMerging: "none" | "split" | "full" = "split"

    @Expose({ name: 'forcenodump' })
    private forceNoDump: "obsolete" | "required" | "ignore" = "obsolete"

    @Expose({ name: 'forcepacking' })
    private forcePacking: "zip" | "unzip" = "zip"
}

export class RomCenter {
    private plugin?: string

    @Expose({ name: 'rommode' })
    private romMode: "merged" | "split" | "unmerged" = "split"

    @Expose({ name: 'biosmode' })
    private biosMode: "merged" | "split" | "unmerged" = "split"

    @Expose({ name: 'samplemode' })
    private sampleMode: "merged" | "unmerged" = "merged"

    @Expose({ name: 'lockrommode' })
    private lockRomMode: "yes" | "no" = "no"

    @Expose({ name: 'lockbiosmode' })
    private lockBiosMode: "yes" | "no" = "no"

    @Expose({ name: 'locksamplemode' })
    private lockSampleMode: "yes" | "no" = "no"
}

export class Header {
    private name!: string
    private description!: string
    private category?: string
    private version!: string
    private date?: string
    private author!: string
    private email?: string
    private homepage?: string
    private url?: string
    private comment?: string

    @Type(() => ClrMamePro)
    @Expose({ name: 'clrmamepro' })
    private clrMamePro?: ClrMamePro

    @Type(() => RomCenter)
    @Expose({ name: 'romcenter' })
    private romCenter?: RomCenter
}

export class ROM {
    private name!: string
    private size!: bigint
    private crc?: string
    private sha1?: string
    private md5?: string
    private merge?: string
    private status: "baddump" | "nodump" | "good" | "verified" = "good"
    private date?: string
}

export class Disk {
    private name!: string
    private sha1?: string
    private md5?: string
    private merge?: string
    private status: "baddump" | "nodump" | "good" | "verified" = "good"
}

export class Sample {
    private name!: string
}

export class Archive {
    private name!: string
}

export class Release {
    private name!: string
    private region!: string
    private language?: string
    private date?: string
    private default: "yes" | "no" = "no"

    getRegion(): string {
        return this.region;
    }
}

export class BIOSSet {
    private name!: string
    private description!: string
    private default: "yes" | "no" = "no"
}

export class Game {
    private name!: string
    private description!: string

    @Expose({ name: 'sourcefile' })
    private sourceFile?: string

    @Expose({ name: 'isbios' })
    private isBios: "yes" | "no" = "no"

    @Expose({ name: 'cloneof' })
    private cloneOf?: string

    @Expose({ name: 'romof' })
    private romOf?: string

    @Expose({ name: 'sampleof' })
    private sampleOf?: string

    private board?: string

    @Expose({ name: 'rebuildto' })
    private rebuildTo?: string

    private year?: string
    private manufacturer?: string

    @Type(() => Release)
    private release!: Release | Release[]

    @Type(() => BIOSSet)
    private biosSet!: BIOSSet | BIOSSet[]

    @Type(() => ROM)
    private rom!: ROM | ROM[]

    @Type(() => Disk)
    private disk!: Disk | Disk[]

    @Type(() => Sample)
    private sample!: Sample | Sample[]

    @Type(() => Archive)
    private archive!: Archive | Archive[]

    getName(): string {
        return this.name;
    }

    getReleases(): Release[] {
        if (this.release instanceof Array) {
            return this.release;
        } else if (this.release) {
            return [this.release];
        } else {
            return [];
        }
    }

    isParent(): boolean {
        return this.getParent() === "";
    }

    getParent(): string {
        return this.cloneOf || this.romOf || this.sampleOf || "";
    }
}

export class Parent {
    name!: string

    @Type(() => Game)
    private games!: Game[]

    private regionsToGames!: Map<string, Game>

    constructor(name: string, parent: Game) {
        this.name = name;
        this.games = [parent];
        this.refreshRegionsToRoms();
    }

    addChild(child: Game) {
        this.games.push(child);
        this.refreshRegionsToRoms();
    }

    private refreshRegionsToRoms() {
        this.regionsToGames = new Map<string, Game>();
        this.games.forEach((game: Game) => {
            if (game.getReleases()) {
                game.getReleases().forEach((release: Release) => {
                    this.regionsToGames.set(release.getRegion(), game);
                });
            }
        });
    }
}

export class DAT {
    @Type(() => Header)
    private header!: Header

    @Type(() => Game)
    private game!: Game | Game[]

    // Post-processed

    @Type(() => Parent)
    private parents!: Map<string, Parent>

    static fromObject(obj: Object) {
        return plainToInstance(DAT, obj, {
            excludeExtraneousValues: false,
            enableImplicitConversion: true
        })
            .generateParents();
    }

    getGames(): Game[] {
        if (this.game instanceof Array) {
            return this.game;
        } else if (this.game) {
            return [this.game];
        } else {
            return [];
        }
    }

    private generateParents() {
        // Find all parents
        this.parents = new Map<string, Parent>();
        this.getGames().forEach((game: Game) => {
            if (game.isParent()) {
                this.parents.set(game.getName(), new Parent(game.getName(), game));
            }
        });

        // Find all clones
        this.getGames().forEach((game: Game) => {
           if (!game.isParent()) {
               const parent = this.parents.get(game.getParent());
               if (parent) {
                   parent.addChild(game);
               }
           }
        });

        return this;
    }
}
