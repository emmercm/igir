import {Expose, plainToInstance} from "class-transformer";
import fg from "fast-glob";

export class Options {
    @Expose({ name: 'dat' })
    private datFiles!: string[]

    @Expose({ name: 'input' })
    private inputFiles!: string[]

    static fromObject(obj: Object) {
        return plainToInstance(Options, obj, {
            enableImplicitConversion: true
        })
            .applyFileGlobs()
            .validate();
    }

    private applyFileGlobs(): Options {
        this.datFiles = fg.sync(this.datFiles);
        this.inputFiles = fg.sync(this.inputFiles);
        return this;
    }

    private validate(): Options {
        // TODO(cemmer): validate fields on the class
        return this;
    }

    getDatFiles(): string[] {
        return this.datFiles;
    }

    getInputFiles(): string[] {
        return this.inputFiles;
    }
}
