import {Expose, plainToInstance, Type} from "class-transformer";
import 'reflect-metadata';
import path from "path";

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

    getName(): string {
        return this.name;
    }
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

    getExtension(): string {
        return path.extname(this.name);
    }

    getCrc(): string {
        return this.crc ? this.crc.replace(/^0x/, '').padStart(8, '0') : '';
    }

    getSha1(): string {
        return this.sha1 ? this.sha1.replace(/^0x/, '').padStart(40, '0') : '';
    }

    getMd5(): string {
        return this.md5 ? this.md5.replace(/^0x/, '').padStart(32, '0') : '';
    }
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
        // TODO(cemmer): when the region isn't set but it can be parsed from release name
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
    private _isBios: "yes" | "no" = "no"

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

    getRoms(): ROM[] {
        if (this.rom instanceof Array) {
            return this.rom;
        } else if (this.rom) {
            return [this.rom];
        } else {
            return [];
        }
    }

    getRomExtensions(): string[] {
        return this.getRoms().map((rom: ROM) => rom.getExtension());
    }

    isAftermarket(): boolean {
        return this.name.match(/\(Aftermarket[ a-zA-Z0-9.]*\)/i) !== null;
    }

    isBad(): boolean {
        return this.name.match(/\[b\]]/i) !== null;
    }

    isBios(): boolean {
        return this._isBios === 'yes' || this.name.indexOf('[BIOS]') !== -1;
    }

    isDemo(): boolean {
        return this.name.match(/\(Demo[ a-zA-Z0-9.]*\)/i) !== null;
    }

    isHomebrew(): boolean {
        return this.name.match(/\(Homebrew[ a-zA-Z0-9.]*\)/i) !== null;
    }

    isPrototype(): boolean {
        return this.name.match(/\(Proto[ a-zA-Z0-9.]*\)/i) !== null;
    }

    isTest(): boolean {
        return this.name.match(/\(Test[ a-zA-Z0-9.]*\)/i) !== null;
    }

    isUnlicensed(): boolean {
        return this.name.match(/\(Unl[ a-zA-Z0-9.]*\)/i) !== null;
    }

    isParent(): boolean {
        return !this.isClone();
    }

    isClone(): boolean {
        return this.getParent() !== "";
    }

    getParent(): string {
        return this.cloneOf || this.romOf || this.sampleOf || "";
    }
}

export class Parent {
    name!: string

    @Type(() => Game)
    private games!: Game[]

    private releaseRegionsToGames!: Map<string, Game>

    constructor(name: string, parent: Game) {
        this.name = name;
        this.games = [parent];
        this.refreshRegionsToRoms();
    }

    getName(): string {
        return this.name;
    }

    getGames(): Game[] {
        return this.games;
    }

    addChild(child: Game) {
        this.games.push(child);
        this.refreshRegionsToRoms();
    }

    private refreshRegionsToRoms() {
        this.releaseRegionsToGames = new Map<string, Game>();
        this.games.forEach((game: Game) => {
            if (game.getReleases()) {
                game.getReleases().forEach((release: Release) => {
                    this.releaseRegionsToGames.set(release.getRegion(), game);
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

    private gameNamesToParents!: Map<string, Parent>

    static fromObject(obj: Object) {
        return plainToInstance(DAT, obj, {
            enableImplicitConversion: true
        })
            .generateGameNamesToParents();
    }

    private generateGameNamesToParents(): DAT {
        // Find all parents
        this.gameNamesToParents = new Map<string, Parent>();
        this.getGames().forEach((game: Game) => {
            if (game.isParent()) {
                this.gameNamesToParents.set(game.getName(), new Parent(game.getName(), game));
            }
        });

        // Find all clones
        this.getGames().forEach((game: Game) => {
            if (!game.isParent()) {
                const parent = this.gameNamesToParents.get(game.getParent());
                if (parent) {
                    parent.addChild(game);
                }
            }
        });

        return this;
    }

    getName(): string {
        return this.header.getName();
    }

    private getGames(): Game[] {
        if (this.game instanceof Array) {
            return this.game;
        } else if (this.game) {
            return [this.game];
        } else {
            return [];
        }
    }

    getParents(): Parent[] {
        return [...this.gameNamesToParents.values()];
    }

    getRomExtensions(): string[] {
        return this.getGames()
            .flatMap((game: Game) => game.getRomExtensions())
            .filter((ext: string, idx: number, exts: string[]) => exts.indexOf(ext) === idx);
    }
}
