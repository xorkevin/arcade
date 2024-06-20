package main

import (
	"xorkevin.dev/governor"
)

func main() {
	vcsinfo := governor.ReadVCSBuildInfo()
	opts := governor.Opts{
		Appname: "arcade",
		Version: governor.Version{
			Num:  vcsinfo.ModVersion,
			Hash: vcsinfo.VCSStr(),
		},
		Description:   "Arcade is an online hub",
		DefaultFile:   "arcade",
		EnvPrefix:     "arcade",
		ClientDefault: "arcadec",
		ClientPrefix:  "arcadec",
	}

	_ = governor.New(opts, nil)
}
